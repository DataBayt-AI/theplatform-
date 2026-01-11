import { createRepo, uploadFile } from '@huggingface/hub';

export interface HFCredentials {
    accessToken: string;
}

export const huggingFaceService = {
    /**
     * Creates a dataset repository (if it doesn't exist) and uploads a file to it.
     */
    publishDataset: async (
        repoId: string,
        fileContent: Blob,
        credentials: HFCredentials,
        fileName: string = 'data.jsonl'
    ): Promise<void> => {
        // 1. Create Repo (idempotent if exists)
        console.log(`Creating/Checking repo: ${repoId}`);
        try {
            await createRepo({
                repo: { type: "dataset", name: repoId },
                credentials,
                private: true,
            });
        } catch (e: any) {
            // Ignore if repo already exists (409)
            if (e.message && !e.message.includes('409') && !e.message.includes('exists')) {
                console.warn("Repo creation warning (might exist):", e);
                // We continue, as the repo might already exist
            }
        }

        // 2. Upload File
        console.log(`Uploading file to: ${repoId}`);

        // Create a File object from the Blob to satisfy the type requirement
        const file = new File([fileContent], fileName, { type: fileContent.type });

        await uploadFile({
            repo: { type: "dataset", name: repoId },
            credentials,
            file: {
                path: fileName,
                content: fileContent
            }
        });
    }
};
