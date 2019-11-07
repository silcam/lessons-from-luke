import app from "./desktopApp";
import { setupDesktopStorage } from "../core/util/fsUtils";

const port = 8081;
const version = "1.2";

setupDesktopStorage();

app.listen(port, () =>
  console.log(
    `Lessons-from-Luke Desktop version ${version}\nTranslation server is running!\nGo to http://localhost:${port} in your browser`
  )
);
