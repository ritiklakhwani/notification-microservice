import express from "express";
import cors from "cors";
import "dotenv/config";
import { router } from "./routes";

const app = express();
const port = Number(process.env.PORT ?? 3000);

app.use(cors());
app.use(express.json());
app.use(router);

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
