declare module "prexit" {
  function prexit(cb: () => any): void;
  namespace prexit {
    let code: number;
    let ondone: () => void;
  }
  export default prexit;
}
