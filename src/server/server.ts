import serverApp from "./serverApp";

const app = serverApp();

app.listen(8081, function() {
  console.log("Lessons from Luke API listening on port 8081.\n");
});
