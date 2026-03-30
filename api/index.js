const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

const app = express();
const MONGO_URI = process.env.MONGO_URI || 'mongodb://admin:DBpokaw@ac-mpuhdam-shard-00-00.5ugwtcq.mongodb.net:27017,ac-mpuhdam-shard-00-01.5ugwtcq.mongodb.net:27017,ac-mpuhdam-shard-00-02.5ugwtcq.mongodb.net:27017/stockManagerDB?ssl=true&authSource=admin';

app.use(cors());
app.use(express.json());

// --- Database Connection (Singleton for Vercel) ---
let cachedDb = null;
async function connectToDatabase() {
    if (cachedDb) return cachedDb;
    await mongoose.connect(MONGO_URI);
    cachedDb = mongoose.connection;
    return cachedDb;
}

// --- Schemas & Models ---
const ProductSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    cat: String, ser: String, size: String, unit: String, animal: String, brand: String, minStk: { type: Number, default: 0 }, cust: String
});

const TransactionSchema = new mongoose.Schema({
    id: { type: Number, required: true, unique: true },
    lot: String, d: String, pid: { type: String, required: true }, pname: String, cat: String, t: String, mfg: String, exp: String, ref: String, cust: String, recorder: String, qi: { type: Number, default: 0 }, qo: { type: Number, default: 0 }, note: String
}, { timestamps: true });

const CountHistorySchema = new mongoose.Schema({
    round: String, date: String, checker: String, adjCount: Number
}, { timestamps: true });

const Product = mongoose.models.Product || mongoose.model('Product', ProductSchema);
const Transaction = mongoose.models.Transaction || mongoose.model('Transaction', TransactionSchema);
const CountHistory = mongoose.models.CountHistory || mongoose.model('CountHistory', CountHistorySchema);

// --- API Endpoints ---

app.get('/api/status', async (req, res) => {
    await connectToDatabase();
    res.json({ status: 'Online', db: 'MongoDB Atlas', deployment: 'Vercel' });
});

app.get('/api/products', async (req, res) => {
    await connectToDatabase();
    const products = await Product.find().sort({ id: 1 });
    res.json(products);
});

app.post('/api/products', async (req, res) => {
    await connectToDatabase();
    const newProd = new Product(req.body);
    await newProd.save();
    res.status(201).json(newProd);
});

app.patch('/api/products/:id', async (req, res) => {
    await connectToDatabase();
    const updated = await Product.findOneAndUpdate({ id: req.params.id }, req.body, { new: true });
    res.json(updated);
});

app.get('/api/tx', async (req, res) => {
    await connectToDatabase();
    const txs = await Transaction.find().sort({ id: -1 });
    res.json(txs);
});

app.post('/api/tx', async (req, res) => {
    await connectToDatabase();
    const newTx = new Transaction({ ...req.body, id: Date.now() });
    await newTx.save();
    res.status(201).json(newTx);
});

app.get('/api/count-history', async (req, res) => {
    await connectToDatabase();
    const history = await CountHistory.find().sort({ createdAt: -1 });
    res.json(history);
});

app.post('/api/count-history', async (req, res) => {
    await connectToDatabase();
    const newEntry = new CountHistory(req.body);
    await newEntry.save();
    res.status(201).json(newEntry);
});

// Export the app for Vercel
module.exports = app;
