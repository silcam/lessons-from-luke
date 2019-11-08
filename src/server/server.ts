import express from "express";
import { toTString } from "../core/TString";

const app = express();

app.get("/api/str", (req, res) => {
  res.json(toTString("Bears"));
});

// Serve the files on port 3000.
app.listen(8081, function() {
  console.log("Example app listening on port 8081, yo!\n");
});
