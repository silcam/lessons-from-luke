import app from "./app";

const port = 8080;

app.listen(port, () =>
  console.log(
    `Translation server is running!\nGo to http://localhost:${port} in your browser`
  )
);
