import express from "express";
import { iterator } from "./iterator";

const app = express();
const port = Number(3001);
app.use(express.json());

app.post("/notification/signup", async (req, res) => {
  const data = req.body;
  if(!data) return res.status(400).json({
    success: false,
    message: "invalid data"
  })
  iterator(data)

  return res.status(200).json({
    success: true,
    data: data
  })

});
app.post("/notification/marketing", (req, res) => {});
app.post("/notification/wallet", (req, res) => {});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
