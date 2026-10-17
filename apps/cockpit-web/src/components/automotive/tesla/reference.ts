/** Fixed design fixtures are only for the explicit mock playground, never a backend session screen. */
export function allowFigmaReference(search: string): boolean {
  const params = new URLSearchParams(search)
  return params.get('mode') === 'playground' && params.get('reference') === '1'
}
