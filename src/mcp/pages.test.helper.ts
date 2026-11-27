/** Test helper: plays the user on a one-time secret page (GET it, then POST the values like the browser form). */
export async function fillPage(url: string, values: Record<string, string>): Promise<string> {
  const page = await fetch(url).then((r) => r.text());
  if (!page.includes('<form')) throw new Error(`no form at ${url}`);
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(values).toString() });
  return r.text();
}
