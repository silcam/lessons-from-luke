export default function waitFor(cb: () => boolean): Promise<void> {
  const interval = 100;
  const maxIntervals = 100;

  return new Promise((resolve, reject) => {
    let i = 0;

    const check = () => {
      if (cb()) {
        resolve();
      } else {
        if (i == maxIntervals) {
          reject();
        } else {
          i += 1;
          setTimeout(check, interval);
        }
      }
    };
    check();
  });
}
