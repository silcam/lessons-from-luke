import app from "./desktopApp";
import { setupDesktopStorage } from "./util/fsUtils";

const port = 8081;

setupDesktopStorage();

app.listen(port, () =>
  console.log(
    `Translation server is running!\nGo to http://localhost:${port} in your browser`
  )
);
