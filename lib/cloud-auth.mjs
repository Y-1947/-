// Account endpoint uses the documented Cloud X-API-Key authentication.
// Listing v2 jobs is not implemented on Comfy Cloud and must not be used as an auth probe.
export async function verifyCloudKey(key, fetchImpl = fetch) {
  if (!key) throw new Error('请先保存 Comfy Cloud API Key。');
  const response = await fetchImpl('https://cloud.comfy.org/api/user', {
    headers: {'X-API-Key': key},
    signal: AbortSignal.timeout(30000),
  });
  if (response.status === 401) throw new Error('密钥验证失败（401）：请检查 API Key 是否完整、有效，并重新保存。');
  if (response.status === 403) throw new Error('云端拒绝访问（403）：请检查账号或密钥的访问权限。');
  if (!response.ok) {
    const detail = (await response.text()).slice(0,1200).replaceAll(key,'[redacted]');
    throw new Error(`Comfy Cloud ${response.status}：${detail}`);
  }
  // Consume privately: account information never needs to reach the browser.
  await response.json();
  return {ok:true};
}
