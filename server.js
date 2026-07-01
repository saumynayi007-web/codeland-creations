const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const app = express();

app.use(express.json());
app.use(express.static('.')); 
app.use(express.static(path.join(__dirname, '.')));

// This correctly maps the URL path "/uploads" to the physical server folder "/tmp/uploads"
app.use('/uploads', express.static('/tmp/uploads'));
app.use(express.static(__dirname));
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});
if (!fs.existsSync('/tmp/uploads')) {
    fs.mkdirSync('/tmp/uploads', { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => { 
        cb(null, '/tmp/uploads/'); 
    },
    filename: (req, file, cb) => {
        const utr = req.body.utr || 'unknown';
        cb(null, `${utr}-${Date.now()}${path.extname(file.originalname)}`);
    }
});
const upload = multer({ storage: storage });

// Local database state array
const submissions = [];

// Endpoint to log verification data from user browser
app.post('/api/verify-payment', upload.single('screenshot'), (req, res) => {
    const data = {
        id: `INV-${1000 + submissions.length + 1}`,
        clientName: req.body.clientName || "Valued Client",
        appUsed: req.body.app,
        utrNumber: req.body.utr,
        // FIX: Store the accessible web URL path, not the hard drive path
        screenshotPath: req.file ? `uploads/${req.file.filename}` : null,
        submittedAt: new Date().toLocaleDateString('en-IN'),
        approved: false
    };
    submissions.push(data);
    res.status(200).json({ success: true, data: data });
});

// Admin Panel showing incoming logs with live invoice compilation controls
app.get('/admin/proofs', (req, res) => {
    let tableRows = '';
    submissions.forEach(item => {
        tableRows += `
            <tr>
                <td>${item.id}</td>
                <td>${item.submittedAt}</td>
                <td>${item.clientName}</td>
                <td>${item.appUsed}</td>
                <td style="font-weight: bold; color: #dfcaa7;">${item.utrNumber}</td>
                <td><a href="/${item.screenshotPath}" target="_blank"><img src="/${item.screenshotPath}" width="80"></a></td>
                <td>
                    ${item.approved ? 
                        `<a href="/admin/invoice/${item.id}" target="_blank" style="color: #10b981; text-decoration:none; font-weight:bold;">📄 View Active Bill</a>` : 
                        `<button onclick="approvePayment('${item.id}')" style="background:#dfcaa7; border:none; padding:6px 12px; font-weight:bold; cursor:pointer; border-radius:4px;">Approve & Bill</button>`
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
                img { border-radius: 4px; }
            </style>
            <script>
                function approvePayment(id) {
                    fetch('/api/approve-payment', {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({ id: id })
                    }).then(() => window.location.reload());
                }
            </script>
        </head>
        <body>
            <h2 style="color: #dfcaa7;">Codeland Creations — Client Audit Desk</h2>
            <table>
                <tr><th>Invoice ID</th><th>Date</th><th>Client Name</th><th>App</th><th>UTR / Ref Number</th><th>Screenshot</th><th>Action Panel</th></tr>
                ${tableRows || '<tr><td colspan="7" style="text-align:center; color:#636f8a;">No transactions awaiting clearance.</td></tr>'}
            </table>
        </body>
        </html>
    `);
});

// Trigger Approval state parameter toggles
app.post('/api/approve-payment', (req, res) => {
    const order = submissions.find(item => item.id === req.body.id);
    if (order) order.approved = true;
    res.json({ success: true });
});

// Production Invoice Template Generator
app.get('/admin/invoice/:id', (req, res) => {
    const order = submissions.find(item => item.id === req.params.id);
    if (!order || !order.approved) return res.status(404).send("Invoice missing or verification pending clearance.");

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
                <button class="print-btn" onclick="window.print()" style="float:right; background:#0f172a; color:white; border:none; padding:10px 20px; color:#fff; font-weight:bold; cursor:pointer; border-radius:4px; margin-bottom:20px;">Print / Save PDF</button>
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
            <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee;">
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

app.listen(3000, () => { console.log('Secure Server processing queries on port 3000')});

module.exports = app;