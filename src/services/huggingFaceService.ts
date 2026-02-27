import { createRepo, uploadFile } from '@huggingface/hub';

export interface HFCredentials {
    accessToken: string;
}

export type ProgressCallback = (step: string, pct: number) => void;

const withRetry = async <T>(fn: () => Promise<T>, retries = 3, delayMs = 1000): Promise<T> => {
    try {
        return await fn();
    } catch (e) {
        if (retries === 0) throw e;
        await new Promise(r => setTimeout(r, delayMs));
        return withRetry(fn, retries - 1, delayMs * 2);
    }
};

export const huggingFaceService = {
    /**
     * Creates a dataset repository (if it doesn't exist) and uploads a file to it.
     * Checks repo existence before creating, retries upload on transient failure,
     * and reports granular progress via the optional onProgress callback.
     */
    publishDataset: async (
        repoId: string,
        fileContent: Blob,
        credentials: HFCredentials,
        fileName: string = 'data.jsonl',
        onProgress?: ProgressCallback
    ): Promise<void> => {
        // 1. Check if repo already exists (avoids unnecessary createRepo round-trip)
        onProgress?.('Checking repository...', 50);
        const repoExists = await fetch(`https://huggingface.co/api/datasets/${repoId}`, {
            headers: { Authorization: `Bearer ${credentials.accessToken}` }
        }).then(r => r.ok).catch(() => false);

        // 2. Create repo only if it doesn't exist
        if (!repoExists) {
            onProgress?.('Creating repository...', 60);
            await createRepo({
                repo: { type: 'dataset', name: repoId },
                credentials,
                private: true,
            });
        }

        // 3. Upload file with retry on transient failure
        onProgress?.('Uploading...', 70);
        await withRetry(() =>
            uploadFile({
                repo: { type: 'dataset', name: repoId },
                credentials,
                file: {
                    path: fileName,
                    content: fileContent,
                },
            })
        );

        onProgress?.('Done!', 100);
    }
};
