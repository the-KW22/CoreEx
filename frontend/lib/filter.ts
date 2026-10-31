// The panel's filter field: a name matches when it contains the typed text, ignoring case and outer spaces.
export const matches = (name: string, text: string) => name.toLowerCase().includes(text.trim().toLowerCase());
