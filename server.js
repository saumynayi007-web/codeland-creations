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

const ADMIN_PASSWORD = "Saumy_Manav_Codeland"; // 👈 Change this to your real secret password!

function requireAdminAuth(req, res, next) {
    if (req.query.pass === ADMIN_PASSWORD) {
        return next();
    }
    res.status(403).send("<h1 style='color:#ef4444; font-family:sans-serif;'>Access Denied</h1><p style='color:#636f8a; font-family:sans-serif;'>Unauthorized terminal entry. Security protocols active.</p>");
}

// Admin Panel showing incoming logs with live invoice compilation controls
app.get('/admin/proofs', async (req, res) => {
    try {
        const database = await connectDB();
        const collection = database.collection('submissions');
        const submissions = await collection.find({}).toArray();
        const hasValidUrlPass = req.query.pass === ADMIN_PASSWORD;
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
                            /* FIXED: Restored the actual clickable invoice link button right here */
                            `<a href="/admin/invoice/${item.id}" target="_blank" style="background:#10b981; color:#fff; text-decoration:none; padding:6px 12px; font-weight:bold; border-radius:4px; display:inline-block; font-size:0.9rem;">📄 View Active Bill</a>` : 
                            `<button onclick="approvePayment('${item.id}')" style="background:#dfcaa7; color:#07090e; border:none; padding:6px 12px; font-weight:bold; cursor:pointer; border-radius:4px;">Approve & Bill</button>`
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

                    /* ── PREMIUM STUDIO GATE LOGIN STYLING ── */
                    .auth-overlay {
                        position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
                        background: #07090e; z-index: 10000;
                        display: flex; align-items: center; justify-content: center;
                    }
                    .auth-card {
                        background: rgba(15, 23, 42, 0.45);
                        border: 1px solid rgba(223, 202, 167, 0.15);
                        backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
                        padding: 3rem; border-radius: 24px; width: 100%; max-width: 400px;
                        text-align: center; box-shadow: 0 20px 50px rgba(0,0,0,0.5);
                    }
                    .auth-input {
                        width: 100%; padding: 1rem; border-radius: 50px;
                        background: #0c0f17; border: 1px solid rgba(223, 202, 167, 0.2);
                        color: #fff; text-align: center; font-size: 1rem; margin: 1.5rem 0;
                        outline: none; box-sizing: border-box; transition: 0.3s;
                    }
                    .auth-input:focus {
                        border-color: #dfcaa7; box-shadow: 0 0 15px rgba(223, 202, 167, 0.2);
                    }
                    .auth-btn {
                        width: 100%; padding: 1rem; border-radius: 50px;
                        background: #dfcaa7; border: none; color: #07090e;
                        font-weight: bold; font-size: 1rem; cursor: pointer; transition: 0.3s;
                    }
                    .auth-btn:hover { background: #fff; box-shadow: 0 0 20px rgba(223, 202, 167, 0.3); }
                </style>
                <script>
                    // Core Authentication Evaluation Loop
                    document.addEventListener("DOMContentLoaded", function() {
                        const urlParams = new URLSearchParams(window.location.search);
                        const urlPass = urlParams.get('pass');
                        const sessionToken = sessionStorage.getItem("admin_session_key");
                        const masterPass = "${ADMIN_PASSWORD}";

                        // Mode 1: URL parameter bypass authentication check
                        if (urlPass === masterPass) {
                            sessionStorage.setItem("admin_session_key", urlPass);
                            document.getElementById("login-gate").style.display = "none";
                            return;
                        }

                        // Mode 2: Existing verified active session check
                        if (sessionToken === masterPass) {
                            document.getElementById("login-gate").style.display = "none";
                        }
                    });

                    function validateAdminGate() {
                        const entered = document.getElementById("password-field").value;
                        if (entered === "${ADMIN_PASSWORD}") {
                            sessionStorage.setItem("admin_session_key", entered);
                            document.getElementById("login-gate").style.display = "none";
                        } else {
                            const err = document.getElementById("err-txt");
                            err.textContent = "Invalid Credentials. Access Denied.";
                            err.style.color = "#ef4444";
                        }
                    }

                </style>
                <script>
                    function approvePayment(id) {
                    const urlParams = new URLSearchParams(window.location.search);
                    const pass = urlParams.get('pass');
                        fetch('/api/approve-payment', {
                       method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ 
            id: id, 
            pass: pass // 👈 This makes sure the backend receives your password!
        })
    }).then(response => {
        if (response.ok) {
            window.location.reload();
        } else {
            alert("Approval failed. Please check your credentials.");
        }
    });
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
                 
                <div class="auth-overlay" id="login-gate" style="${hasValidUrlPass ? 'display: none;' : ''}">
                    <div class="auth-card">
                        <h2 style="font-family: serif; color: #dfcaa7; margin: 0 0 0.5rem 0; font-weight: normal; font-size: 1.8rem;">CODELAND STUDIOS</h2>
                        <p style="color: #636f8a; font-size: 0.9rem; margin: 0; letter-spacing: 1px; text-transform: uppercase;">Administrative Terminal Entry</p>
                        
                        <input type="password" id="password-field" class="auth-input" placeholder="Enter System Password" onkeydown="if(event.key === 'Enter') validateAdminGate()">
                        <button onclick="validateAdminGate()" class="auth-btn">Authenticate Clearance</button>
                        
                        <p id="err-txt" style="margin-top: 1rem; font-size: 0.85rem; min-height: 1.2em;"></p>
                    </div>
                </div>

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
// Trigger Approval state parameter toggles - SECURED!
app.post('/api/approve-payment', async (req, res) => {
    try {
        // Authenticate the API request payload
        if (req.body.pass !== ADMIN_PASSWORD) {
            return res.status(403).json({ success: false, error: "Unauthorized endpoint action access blocked." });
        }

        const database = await connectDB();
        const collection = database.collection('submissions');
        
        const result = await collection.updateOne(
            { id: req.body.id }, 
            { $set: { approved: true } }
        );

        if (result.matchedCount === 0) {
            return res.status(404).json({ success: false, error: "Invoice record mismatch" });
        }
        
        res.status(200).json({ success: true });
    } catch (err) {
        console.error("Approval system error:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// Production Invoice Template Generator
app.get('/admin/invoice/:id', async (req, res) => {
    try {
        const database = await connectDB();
        const collection = database.collection('submissions');

        // Extract the invoice using a clean query selector targeting your string format ID
        const order = await collection.findOne({ id: req.params.id });

        // If no match is found, or it's not approved, exit cleanly with a 404 text message instead of a 500 crash
        if (!order) {
            return res.status(404).send("Invoice completely missing from cloud database records.");
        }
        if (!order.approved) {
            return res.status(403).send("Verification pending clearance. Please approve the payment first.");
        }

        // Defensive code parsing variables to prevent rendering breaks
        const invoiceId = order.id || 'INV-UNKNOWN';
        const clientName = order.clientName || 'Valued Client';
        const submittedAt = order.submittedAt || new Date().toLocaleDateString('en-IN');
        const utrNumber = order.utrNumber || 'N/A';

        res.send(`
            <html>
            <head>
                <title>Invoice ${invoiceId}</title>
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
                            <p style="margin:5px 0 0 0; font-weight:bold;">${invoiceId}</p>
                        </div>
                    </div>
                    <table class="meta-table">
                        <tr>
                            <td><strong>Billed To:</strong><br>${clientName}</td>
                            <td style="text-align:right;"><strong>Date:</strong> ${submittedAt}<br><strong>UTR Ref:</strong> ${utrNumber}</td>
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
        console.error("Invoice Error Log:", err);
        res.status(500).send("Internal server layout rendering error occurred.");
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