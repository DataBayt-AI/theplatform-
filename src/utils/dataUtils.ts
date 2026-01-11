/**
 * Interpolates variables in a prompt string using metadata values.
 * Replaces {{key}} with value from metadata.
 */
export const getInterpolatedPrompt = (prompt: string, metadata?: Record<string, string>): string => {
    if (!prompt || !metadata) return prompt;
    let interpolated = prompt;
    Object.entries(metadata).forEach(([key, value]) => {
        const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        interpolated = interpolated.replace(new RegExp(`{{${escapedKey}}}`, 'g'), value);
    });
    return interpolated;
};
