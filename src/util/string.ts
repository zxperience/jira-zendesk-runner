export function areEquivalent(val1: any, val2: any): boolean {
    const normalize = (v: any) => (v === null || v === undefined || v === '') ? null : v;
    return normalize(val1) === normalize(val2);
}