const app = require('./test');

const port = Number(process.env.PORT || 5000);
app.listen(port, () => console.log(`BitEat is running at http://localhost:${port}`));
