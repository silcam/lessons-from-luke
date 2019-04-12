module.exports = shipit => {
  // Load shipit-deploy tasks
  require("shipit-deploy")(shipit);
  require("shipit-shared")(shipit);

  shipit.initConfig({
    default: {
      deployTo: "/var/www/luke-lessons",
      repositoryUrl: "https://github.com/silcam/lessons-from-luke.git",
      shared: {
        overwrite: true,
        basePath: "/var/www/luke-lessons/shared",
        dirs: ["strings", "node_modules"],
        files: ["src/util/secrets.ts"]
      }
    },
    production: {
      servers: { host: "iozoom", user: "luke-lessons" }
    }
  });

  shipit.blTask("build", async () => {
    try {
      res = await shipit.remote(
        `cd ${shipit.releasePath} && yarn install --production && yarn build`
      );
      // console.log(res.stdout);
    } catch (err) {
      console.error(err.stderr);
    }
  });

  shipit.blTask("restart", async () => {
    try {
      const tmpDir = shipis.releasePath + "/tmp";
      res = await shipit.remote(
        `mkdir ${tmpDir} && touch ${tmpDir}/restart.txt`
      );
    } catch (err) {
      console.error(err.stderr);
    }
  });

  shipit.on("sharedEnd", () => {
    shipit.start("build", "restart");
  });
};
