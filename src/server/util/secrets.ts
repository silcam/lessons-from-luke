import fs from "fs";

const secretsJson = "secrets.json";

const defaultSecrets = {
  cookieSecret: "fuerabgui4pab5m32;tkqipn84",
  adminUsername: "chris",
  adminPassword: "yo",
  db: {
    database: "lessons-from-luke",
    username: "lessons-from-luke",
    password: "lessons-from-luke"
  }
};

const secrets: typeof defaultSecrets = fs.existsSync(secretsJson)
  ? JSON.parse(fs.readFileSync(secretsJson).toString())
  : defaultSecrets;

export default secrets;
