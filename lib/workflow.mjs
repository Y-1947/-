export function validateGraph(graph) {
  if (!graph || Array.isArray(graph) || typeof graph !== 'object' || graph.nodes || !Object.keys(graph).length)
    throw new Error('请导出 ComfyUI 的 API 格式工作流，不是普通画布 JSON。');
  for (const node of Object.values(graph)) {
    if (!node || typeof node.class_type !== 'string' || !node.inputs || typeof node.inputs !== 'object')
      throw new Error('工作流节点缺少 class_type 或 inputs。');
  }
  return graph;
}
export function prepareGraph(graph, bindings, values) {
  const result = structuredClone(validateGraph(graph));
  for (const [key, binding] of Object.entries(bindings)) {
    if (!binding || values[key] === undefined) continue;
    const split = binding.lastIndexOf('.');
    const node = result[binding.slice(0, split)], input = binding.slice(split + 1);
    if (split < 1 || !node || !Object.hasOwn(node.inputs, input)) throw new Error(`节点绑定无效：${key} → ${binding}`);
    node.inputs[input] = values[key];
  }
  return result;
}
export function selectOutput(job, nodeId) {
  const outputs = (job.outputs || []).filter(o => o.content_type?.startsWith('image/') && (!nodeId || o.node_id === nodeId));
  if (outputs.length !== 1) throw new Error('工作流须输出一张图片；多个输出时请配置准确的输出节点 ID。');
  return outputs[0];
}
