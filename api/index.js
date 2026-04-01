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

app.delete('/api/products/:id', async (req, res) => {
    await connectToDatabase();
    const deleted = await Product.findOneAndDelete({ id: req.params.id });
    if (!deleted) return res.status(404).json({ error: 'Product not found' });
    res.json({ ok: true });
});

// ── Bulk endpoints for Backup/Restore ──────────────────
app.delete('/api/products', async (req, res) => {
    await connectToDatabase();
    await Product.deleteMany({});
    res.json({ ok: true });
});

app.delete('/api/tx', async (req, res) => {
    await connectToDatabase();
    await Transaction.deleteMany({});
    res.json({ ok: true });
});

app.delete('/api/count-history', async (req, res) => {
    await connectToDatabase();
    await CountHistory.deleteMany({});
    res.json({ ok: true });
});

app.post('/api/products/bulk', async (req, res) => {
    await connectToDatabase();
    await Product.insertMany(req.body, { ordered: false }).catch(()=>{});
    res.json({ ok: true });
});

app.post('/api/tx/bulk', async (req, res) => {
    await connectToDatabase();
    await Transaction.insertMany(req.body, { ordered: false }).catch(()=>{});
    res.json({ ok: true });
});

app.post('/api/count-history/bulk', async (req, res) => {
    await connectToDatabase();
    await CountHistory.insertMany(req.body, { ordered: false }).catch(()=>{});
    res.json({ ok: true });
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

// ── Export Excel endpoints ────────────────────────────────
const XLSX = require('xlsx');

function todayStr(){
    const d=new Date();
    return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
}

function parseDMY(s){
    if(!s)return null;
    const p=String(s).split('/');
    if(p.length!==3)return null;
    return new Date(+p[2],+p[1]-1,+p[0]);
}

function daysUntil(dateStr){
    if(!dateStr)return null;
    const d=parseDMY(dateStr)||new Date(dateStr);
    if(!d||isNaN(d.getTime()))return null;
    return Math.round((d-new Date())/(1000*60*60*24));
}

function getLotsForProduct(pid, txs){
    const lots={};
    let unassignedQi=0,unassignedQo=0;
    txs.filter(t=>t.pid===pid).forEach(t=>{
        const lot=(t.lot||'').trim();
        if(!lot){unassignedQi+=(t.qi||0);unassignedQo+=(t.qo||0);return;}
        if(!lots[lot])lots[lot]={lot,mfg:t.mfg||'',exp:t.exp||'',cust:t.cust||'',qi:0,qo:0};
        lots[lot].qi+=(t.qi||0);lots[lot].qo+=(t.qo||0);
        if(t.exp&&(!lots[lot].exp||parseDMY(t.exp)>parseDMY(lots[lot].exp)))lots[lot].exp=t.exp;
        if(t.mfg&&(!lots[lot].mfg||parseDMY(t.mfg)>parseDMY(lots[lot].mfg)))lots[lot].mfg=t.mfg;
        if(t.cust)lots[lot].cust=t.cust;
    });
    const sorted=Object.values(lots).sort((a,b)=>{
        if(!a.exp)return 1;if(!b.exp)return -1;
        return (parseDMY(a.exp)||0)-(parseDMY(b.exp)||0);
    });
    let remainOut=Math.max(0,unassignedQo-unassignedQi);
    for(const l of sorted){
        if(remainOut<=0)break;
        const rem=l.qi-l.qo;
        if(rem>0){const take=Math.min(rem,remainOut);l.qo+=take;remainOut-=take;}
    }
    const netUnassigned=unassignedQi-unassignedQo;
    if(netUnassigned>0)sorted.push({lot:'(unassigned)',mfg:'',exp:'',cust:'',qi:netUnassigned,qo:0});
    return sorted.filter(l=>l.qi-l.qo>0);
}

const TYPE_MAP={in:'รับเข้า',sale:'ขายออก',sample:'ส่งตัวอย่าง',adj:'ปรับลด','adj-in':'ปรับเพิ่ม',other:'อื่นๆ'};

// GET /api/export/stock
app.get('/api/export/stock', async(req,res)=>{
    await connectToDatabase();
    const [prods,txs]=await Promise.all([Product.find().lean(),Transaction.find().lean()]);
    const wb=XLSX.utils.book_new();

    // Sheet 1: Stock Summary
    const summaryRows=prods.map(p=>{
        const lots=getLotsForProduct(p.id,txs);
        const qty=lots.filter(l=>{const d=daysUntil(l.exp);return d===null||d>=0;}).reduce((a,l)=>a+(l.qi-l.qo),0);
        const allExp=lots.filter(l=>l.exp).map(l=>l.exp);
        const activeExp=lots.filter(l=>l.exp&&(daysUntil(l.exp)===null||daysUntil(l.exp)>=0)).map(l=>l.exp);
        const nearestExp=activeExp.length?activeExp.sort((a,b)=>(parseDMY(a)||0)-(parseDMY(b)||0))[0]:(allExp.length?allExp.sort((a,b)=>(parseDMY(b)||0)-(parseDMY(a)||0))[0]:'');
        const days=daysUntil(nearestExp);
        let stkStatus='ปกติ';
        if(qty<=0)stkStatus='หมดสต๊อก';
        else if(p.minStk>0&&qty<p.minStk)stkStatus='ต่ำกว่า Min';
        let expStatus='—';
        if(days!==null)expStatus=days<0?'หมดอายุแล้ว':days<=30?`ด่วน (${days} วัน)`:days<=90?`ใกล้หมด (${days} วัน)`:`ปกติ (${days} วัน)`;
        return {'Product ID':p.id,'Product Name':p.name,'Category':p.cat,'Brand':p.brand,'Balance (non-exp)':qty,'Unit':p.unit,'Min Stock':p.minStk||0,'Stock Status':stkStatus,'Nearest EXP':nearestExp||'—','EXP Status':expStatus};
    });
    const ws1=XLSX.utils.json_to_sheet(summaryRows);
    ws1['!cols']=[{wch:22},{wch:40},{wch:16},{wch:10},{wch:20},{wch:8},{wch:10},{wch:14},{wch:14},{wch:20}];
    XLSX.utils.book_append_sheet(wb,ws1,'Stock Summary');

    // Sheet 2: Lot Detail
    const lotRows=[];
    prods.forEach(p=>{
        getLotsForProduct(p.id,txs).forEach(l=>{
            const bal=l.qi-l.qo;
            const days=daysUntil(l.exp);
            let expStatus='—';
            if(days!==null)expStatus=days<0?'Expired':days<=30?`Urgent (${days}d)`:days<=90?`Near EXP (${days}d)`:`OK (${days}d)`;
            lotRows.push({'Product ID':p.id,'Product Name':p.name,'Category':p.cat,'Brand':p.brand,'Lot/Batch':l.lot,'Balance':bal,'Unit':p.unit,'MFG Date':l.mfg||'—','EXP Date':l.exp||'—','EXP Status':expStatus,'Customer':l.cust||'—'});
        });
    });
    const ws2=XLSX.utils.json_to_sheet(lotRows.length?lotRows:[{'Note':'No lot data'}]);
    ws2['!cols']=[{wch:22},{wch:40},{wch:16},{wch:10},{wch:20},{wch:10},{wch:8},{wch:14},{wch:14},{wch:18},{wch:16}];
    XLSX.utils.book_append_sheet(wb,ws2,'Lot Detail');

    const buf=XLSX.write(wb,{type:'buffer',bookType:'xlsx'});
    res.setHeader('Content-Disposition',`attachment; filename="Stock_NaiveInnova_${todayStr()}.xlsx"`);
    res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buf);
});

// GET /api/export/history
app.get('/api/export/history', async(req,res)=>{
    await connectToDatabase();
    const txs=await Transaction.find().sort({id:-1}).lean();
    const wb=XLSX.utils.book_new();

    const rows=txs.map((t,i)=>({'No':i+1,'Date':t.d||'','Lot/Batch':t.lot||'','Product ID':t.pid||'','Product Name':t.pname||'','Category':t.cat||'','Type':TYPE_MAP[t.t]||t.t||'','Qty In':t.qi||0,'Qty Out':t.qo||0,'Net':(t.qi||0)-(t.qo||0),'MFG Date':t.mfg||'','EXP Date':t.exp||'','Ref Doc':t.ref||'','Customer':t.cust||'','Recorder':t.recorder||'','Note':t.note||''}));
    const ws1=XLSX.utils.json_to_sheet(rows.length?rows:[{'Note':'No data'}]);
    ws1['!cols']=[{wch:6},{wch:12},{wch:20},{wch:22},{wch:36},{wch:14},{wch:14},{wch:10},{wch:10},{wch:8},{wch:12},{wch:12},{wch:18},{wch:16},{wch:14},{wch:24}];
    XLSX.utils.book_append_sheet(wb,ws1,'History');

    const byProd={};
    txs.forEach(t=>{
        if(!byProd[t.pid])byProd[t.pid]={pid:t.pid,pname:t.pname||'',totalIn:0,totalOut:0,count:0};
        byProd[t.pid].totalIn+=(t.qi||0);byProd[t.pid].totalOut+=(t.qo||0);byProd[t.pid].count++;
    });
    const sumRows=Object.values(byProd).map(r=>({'Product ID':r.pid,'Product Name':r.pname,'Total In':r.totalIn,'Total Out':r.totalOut,'Net':r.totalIn-r.totalOut,'Transactions':r.count}));
    const ws2=XLSX.utils.json_to_sheet(sumRows.length?sumRows:[{'Note':'No data'}]);
    ws2['!cols']=[{wch:22},{wch:36},{wch:12},{wch:12},{wch:10},{wch:14}];
    XLSX.utils.book_append_sheet(wb,ws2,'Summary by Product');

    const buf=XLSX.write(wb,{type:'buffer',bookType:'xlsx'});
    res.setHeader('Content-Disposition',`attachment; filename="History_NaiveInnova_${todayStr()}.xlsx"`);
    res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buf);
});

// GET /api/export/count-history
app.get('/api/export/count-history', async(req,res)=>{
    await connectToDatabase();
    const history=await CountHistory.find().sort({createdAt:-1}).lean();
    const wb=XLSX.utils.book_new();

    const rows=history.length?history.map((c,i)=>({'No':i+1,'Round':c.round||'','Date':c.date||'','Checker':c.checker||'','Adj Count':c.adjCount||0,'Note':c.note||''})):[{'Note':'No count history yet'}];
    const ws1=XLSX.utils.json_to_sheet(rows);
    ws1['!cols']=[{wch:6},{wch:20},{wch:14},{wch:18},{wch:14},{wch:24}];
    XLSX.utils.book_append_sheet(wb,ws1,'Count History');

    const buf=XLSX.write(wb,{type:'buffer',bookType:'xlsx'});
    res.setHeader('Content-Disposition',`attachment; filename="CountHistory_NaiveInnova_${todayStr()}.xlsx"`);
    res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buf);
});

// Export the app for Vercel
module.exports = app;
