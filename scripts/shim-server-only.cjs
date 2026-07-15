/** 允许 tsx 脚本 import 带 "server-only" 的模块 */
const Module = require("module");
const original = Module.prototype.require;
Module.prototype.require = function (id) {
  if (id === "server-only") return {};
  return original.apply(this, arguments);
};
