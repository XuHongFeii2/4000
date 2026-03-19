let runtime = null;

export function setClawXImRuntime(next) {
  runtime = next;
}

export function getClawXImRuntime() {
  if (!runtime) {
    throw new Error("龙虾APP运行时未初始化");
  }
  return runtime;
}
