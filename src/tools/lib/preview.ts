export const page = (body: string, bg = '#ffffff') => `<!doctype html><meta charset="utf-8"><body style="margin:0;background:${bg};font:13px system-ui,sans-serif">${body}`;
export const swatchPage = (out: string) => page('', /#[0-9a-f]{6}/i.exec(out)?.[0] ?? '#ffffff').replace('<body style="', '<body style="height:100vh;');
export const hexesIn = (out: string) => [...new Set(out.match(/#[0-9a-fA-F]{6}\b/g) ?? [])];
