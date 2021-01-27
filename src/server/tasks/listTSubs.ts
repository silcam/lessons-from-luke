import PGStorage from "../storage/PGStorage";
import findTSubs from "../actions/findTSubs";

listTSubs();

/*
  I wrote this for testing the findTSubs function.
  May prove useful for debugging in the future.
*/

async function listTSubs() {
  const storage = new PGStorage();
  // const subs = (await findTSubs(storage)).tSubs;
  // const xfrmd = subs.map(sub => ({
  //   engFrom: sub.engFrom.map(tStr => tStr?.text),
  //   engTo: sub.engTo.map(tStr => tStr?.text),
  //   from: sub.from.map(tStr => tStr?.text),
  //   to: sub.to.map(tStr => tStr?.text)
  // }));
  // console.log(JSON.stringify(xfrmd, null, "  "));
  console.log("Done");
  // process.exit();
}
