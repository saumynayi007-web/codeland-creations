const express = require('express');
const multer = require('multer');
const path = require('path');
const { MongoClient } = require('mongodb');
const fs = require('fs');
const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, '.')));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use(express.static(path.join(__dirname, '.')));

// Local database state array

const uri = process.env.MONGODB_URI;
let cachedClient = null;
let cachedDb = null;

async function connectDB() {
    if (cachedClient && cachedDb) return cachedDb;
    if (!uri) throw new Error("Missing MONGODB_URI environment variable.");
    
    const client = new MongoClient(uri, {
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 5000
    });
    await client.connect();
    const db = client.db('codeland_billing');
    cachedClient = client;
    cachedDb = db;
    return db;
}

// Fallback image routes for branding assets
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/logo.jpg', (req, res) => res.sendFile(path.join(__dirname, 'logo.jpg')));
app.get('/favicon.png', (req, res) => res.sendFile(path.join(__dirname, 'favicon.png')));
app.get('/favicon.ico', (req, res) => res.sendFile(path.join(__dirname, 'favicon.png')));

// 2. Updated endpoint that encodes your file into absolute text string payloads
app.post('/api/verify-payment', async (req, res) => {
    try {
        const database = await connectDB();
        const collection = database.collection('submissions');
        const totalCount = await collection.countDocuments();
        
        const data = {
            id: `INV-${1000 + totalCount + 1}`,
            clientName: req.body.clientName || "Valued Client",
            appUsed: req.body.app,
            utrNumber: req.body.utr,
            screenshotPath: req.body.screenshotData, // Captures the clean text string directly
            submittedAt: new Date().toLocaleDateString('en-IN'),
            approved: false
        };

        await collection.insertOne(data);
        res.status(200).json({ success: true, data: data });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: err.message });
    }
});


// Admin Panel showing incoming logs with live invoice compilation controls
app.get('/admin/proofs', async (req, res) => {
    try {
        const database = await connectDB();
        const collection = database.collection('submissions');
        const submissions = await collection.find({}).toArray();

        let tableRows = '';
        submissions.forEach(item => {
            const safeDataString = item.screenshotPath ? encodeURIComponent(item.screenshotPath) : '';
            
            tableRows += `
                <tr>
                    <td>${item.id}</td>
                    <td>${item.submittedAt}</td>
                    <td>${item.clientName}</td>
                    <td>${item.appUsed}</td>
                    <td style="font-weight: bold; color: #dfcaa7;">${item.utrNumber}</td>
                    <td>
                        ${item.screenshotPath ? 
                            `<button onclick="openBlobImage('${safeDataString}')" style="background:#1e293b; color:#dfcaa7; border:1px solid #dfcaa7; padding:6px 12px; cursor:pointer; border-radius:4px; font-weight:bold;">👁️ View Proof</button>` : 
                            `<span style="color:#636f8a;">No Image</span>`
                        }
                    </td>
                    <td>
                        ${item.approved ? 
                            `<span style="color: #10b981; font-weight:bold;">📄 Approved</span>` : 
                            `<button onclick="approvePayment('${item.id}')" style="background:#dfcaa7; border:none; padding:6px 12px; font-weight:bold; cursor:pointer; border-radius:4px;">Approve</button>`
                        }
                    </td>
                </tr>`;
        });

        res.send(`
            <html>
            <head>
                <title>Codeland Admin Portal</title>
                <style>
                    body { font-family: sans-serif; background: #07090e; color: #fff; padding: 3rem; }
                    table { width: 100%; border-collapse: collapse; margin-top: 2rem; }
                    th, td { border: 1px solid #1e293b; padding: 14px; text-align: left; }
                    th { background: #0d111a; color: #dfcaa7; }
                </style>
                <script>
                    function approvePayment(id) {
                        fetch('/api/approve-payment', {
                            method: 'POST',
                            headers: {'Content-Type': 'application/json'},
                            body: JSON.stringify({ id: id })
                        }).then(() => window.location.reload());
                    }
                    function openBlobImage(encodedData) {
                        if(!encodedData) return;
                        const dataURI = decodeURIComponent(encodedData);
                        const byteString = atob(dataURI.split(',')[1]);
                        const mimeString = dataURI.split(',')[0].split(':')[1].split(';')[0];
                        const ab = new ArrayBuffer(byteString.length);
                        const ia = new Uint8Array(ab);
                        for (let i = 0; i < byteString.length; i++) { ia[i] = byteString.charCodeAt(i); }
                        const blob = new Blob([ab], {type: mimeString});
                        const blobUrl = URL.createObjectURL(blob);
                        window.open(blobUrl, '_blank');
                    }
                </script>
            </head>
            <body>
                <h2 style="color: #dfcaa7;">Codeland Creations — Client Audit Desk</h2>
                <table>
                    <tr><th>Invoice ID</th><th>Date</th><th>Client Name</th><th>App</th><th>UTR / Ref Number</th><th>Screenshot</th><th>Action Panel</th></tr>
                    ${tableRows || '<tr><td colspan="7" style="text-align:center; color:#636f8a;">No records found.</td></tr>'}
                </table>
            </body>
            </html>
        `);
    } catch (err) {
        res.status(500).send("Database Error: " + err.message);
    }
});

// Trigger Approval state parameter toggles
app.post('/api/approve-payment', async (req, res) => {
    try {
        const database = await connectDB();
        const collection = database.collection('submissions');
        await collection.updateOne({ id: req.body.id }, { $set: { approved: true } });
        res.status(200).json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});


// Production Invoice Template Generator
aapp.get('/admin/invoice/:id', async (req, res) => {
    try {
        const database = await connectDB();
        const collection = database.collection('submissions');

        // Query the database directly for the dynamic invoice ID matching the URL parameter
        const order = await collection.findOne({ id: req.params.id });

        if (!order || !order.approved) {
            return res.status(404).send("Invoice missing or verification pending clearance.");
        }

        res.send(`
            <html>
            <head>
                <title>Invoice ${order.id}</title>
                <style>
                    body { font-family: 'Segoe UI', sans-serif; color: #333; padding: 40px; background: #fff; }
                    .invoice-box { max-width: 800px; margin: auto; border: 1px solid #eee; padding: 30px; box-shadow: 0 0 10px rgba(0, 0, 0, 0.05); }
                    .header { display: flex; justify-content: space-between; border-bottom: 2px solid #dfcaa7; padding-bottom: 20px; }
                    .meta-table { width: 100%; margin-top: 30px; border-collapse: collapse; }
                    .meta-table td { padding: 8px 0; }
                    .items-table { width: 100%; margin-top: 40px; border-collapse: collapse; }
                    .items-table th { background: #0f172a; color: #fff; padding: 12px; text-align: left; }
                    .items-table td { padding: 12px; border-bottom: 1px solid #eee; }
                    .total { text-align: right; font-size: 1.5rem; margin-top: 30px; font-weight: bold; color: #0f172a; }
                    @media print { .print-btn { display: none; } }
                </style>
            </head>
            <body>
                <div class="invoice-box">
                    <button class="print-btn" onclick="window.print()" style="float:right; background:#0f172a; color:white; border:none; padding:10px 20px; font-weight:bold; cursor:pointer; border-radius:4px; margin-bottom:20px;">Print / Save PDF</button>
                    <div style="clear:both;"></div>
                    <div class="header">
                        <div>
                            <h2 style="margin:0; color:#0f172a; letter-spacing:1px;">CODELAND CREATIONS</h2>
                            <p style="font-size:0.9rem; color:#666; margin:5px 0 0 0;">Bespoke Premium Digital Architecture</p>
                        </div>
                        <div style="text-align: right;">
                            <h1 style="margin:0; font-weight:300; color:#999;">INVOICE</h1>
                            <p style="margin:5px 0 0 0; font-weight:bold;">${order.id}</p>
                        </div>
                    </div>
                    <table class="meta-table">
                        <tr>
                            <td><strong>Billed To:</strong><br>${order.clientName}</td>
                            <td style="text-align:right;"><strong>Date:</strong> ${order.submittedAt}<br><strong>UTR Ref:</strong> ${order.utrNumber}</td>
                        </tr>
                    </table>
                    <table class="items-table">
                        <tr><th>Description</th><th>Qty</th><th style="text-align:right;">Amount</th></tr>
                        <tr><td>Project Initiation Retainer Engagement Fee</td><td>1</td><td style="text-align:right;">₹7,500.00</td></tr>
                    </table>
                    <div class="total">Total Paid: ₹7,500.00</div>
                    <p style="margin-top:60px; font-size:0.85rem; color:#999; text-align:center;">This is a system-generated electronic receipt confirming successful settlement clearance.</p>
                </div>
                <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee; max-width: 800px; margin-left: auto; margin-right: auto;">
                    <h4 style="margin: 0 0 10px 0; font-size: 0.9rem;">Terms & Scope:</h4>
                    <p style="font-size: 0.8rem; color: #555; line-height: 1.4;">
                        This invoice covers professional architecture and design services only. 
                        <strong>Note: Third-party costs, including domain name registration, 
                        hosting subscriptions, and premium plugin licenses, are not included 
                        in this retainer fee and must be settled separately by the client.</strong>
                    </p>
                </div>
            </body>
            </html>
        `);
    } catch (err) {
        res.status(500).send("Invoice rendering database error: " + err.message);
    }
});

// Legal documents and listen blocks...
app.get('/privacy-policy', (req, res) => { res.send(`
        <html>
        <head>
            <title>Privacy Policy — Codeland Creations</title>
            <style>
                body { font-family: sans-serif; background: #07090e; color: #fff; padding: 4rem 2rem; line-height: 1.6; }
                .container { max-width: 750px; margin: auto; }
                h1, h2 { color: #dfcaa7; font-family: serif; font-weight: normal; }
                h1 { border-bottom: 1px solid #1e293b; padding-bottom: 1rem; margin-bottom: 2rem; }
                p { color: #8e9bb4; font-size: 0.95rem; margin-bottom: 1.5rem; }
                footer { margin-top: 4rem; text-align: center; color: #636f8a; font-size: 0.85rem; border-top: 1px solid #1e293b; padding-top: 2rem; }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>Privacy Policy</h1>
                <p>At Codeland Creations, your digital asset clearance logistics are fully confidential. We protect the transaction indices and auditing telemetry processed through our settlement networks.</p>
                <h2>1. Information Logging</h2>
                <p>When executing service clearings, our engine saves transaction identifiers including structural configuration metadata, verification payload screenshots, and payment tracking indices (UTR reference strings).</p>
                <h2>2. Data Protection Frameworks</h2>
                <p>All recorded operational details are hosted within closed parameters to safeguard records against systemic breaches or unauthenticated administrative retrieval.</p>
                <footer>
                    &copy; 2026 Codeland Creations. All Rights Reserved.
                </footer>
            </div>
        </body>
        </html>
    `);
});

app.get('/terms-conditions', (req, res) => { res.send(`
        <html>
        <head>
            <title>Terms & Conditions — Codeland Creations</title>
            <style>
                body { font-family: sans-serif; background: #07090e; color: #fff; padding: 4rem 2rem; line-height: 1.6; }
                .container { max-width: 750px; margin: auto; }
                h1, h2 { color: #dfcaa7; font-family: serif; font-weight: normal; }
                h1 { border-bottom: 1px solid #1e293b; padding-bottom: 1rem; margin-bottom: 2rem; }
                p { color: #8e9bb4; font-size: 0.95rem; margin-bottom: 1.5rem; }
                .highlight-box { background: #0d111a; border-left: 3px solid #dfcaa7; padding: 1.5rem; margin: 2rem 0; border-radius: 0 8px 8px 0; }
                .highlight-box p { color: #fff; margin: 0; font-size: 1rem; }
                footer { margin-top: 4rem; text-align: center; color: #636f8a; font-size: 0.85rem; border-top: 1px solid #1e293b; padding-top: 2rem; }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>Terms & Conditions</h1>
                <p>Welcome to Codeland Creations. By engaging our design pipelines or initializing development architecture workflows, you consent to fulfill our legal operational guidelines.</p>
                <h2>1. Service Scope Framework</h2>
                <p>All agreements establish functional milestones exclusively assigned to technical framework development sprints and layout production structures.</p>
                <div class="highlight-box">
                    <p><strong>Scope Clarification:</strong> This invoice covers professional architecture and design services only. Note: Third-party costs, including domain name registration, hosting subscriptions, and premium plugin licenses, are not included in this retainer fee and must be settled separately by the client.</p>
                </div>
                <h2>2. Settlement Procedures</h2>
                <p>Design pipeline sprint documentation will clear instantly upon execution verification by our audit desk infrastructure. Retainer allocations remain fixed under execution protocols.</p>
                <footer>
                    &copy; 2026 Codeland Creations. All Rights Reserved.
                </footer>
            </div>
`);
});

app.listen(3000);
module.exports = app;