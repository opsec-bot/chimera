const vm = require("vm");
const sandbox = {
  console: { log: (...a) => console.log("CAPTURED:", ...a) },
  __captureReplace: (s, p) => console.log("HOOK FIRED:", s, p),
};
const ctx = vm.createContext(sandbox);
vm.runInContext(`
  (function(){
    const orig = String.prototype.replace;
    String.prototype.replace = function(...args) {
      __captureReplace(this, String(args[0]));
      return orig.apply(this, args);
    };
  })();
`, ctx);
vm.runInContext(`"hello/".replace(/\\/$/, "")`, ctx);
console.log("done");
