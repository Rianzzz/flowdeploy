require('dotenv').config();
const express = require('express');
const path = require('path');

const configRouter = require('./src/routes/config');
const flowsRouter = require('./src/routes/flows');

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/config', configRouter);
app.use('/api/flows', flowsRouter);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('');
  console.log('  FlowDeploy rodando!');
  console.log(`  Abra http://localhost:${PORT} no navegador`);
  console.log('');
});
