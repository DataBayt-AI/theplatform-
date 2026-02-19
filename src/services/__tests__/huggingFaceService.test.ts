import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { huggingFaceService, type HFCredentials } from '../huggingFaceService';
import * as hub from '@huggingface/hub';

// Mock the @huggingface/hub module
vi.mock('@huggingface/hub', () => ({
    createRepo: vi.fn(),
    uploadFile: vi.fn(),
}));

describe('HuggingFace Service - publishDataset', () => {
    let mockCredentials: HFCredentials;
    let mockFileContent: Blob;

    beforeEach(() => {
        vi.clearAllMocks();

        mockCredentials = {
            accessToken: 'test-token-123'
        };

        mockFileContent = new Blob(
            [JSON.stringify({ text: 'Test data', label: 'test' })],
            { type: 'application/json' }
        );
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('Successful Publication', () => {
        it('should create repo and upload file successfully with default filename', async () => {
            const mockCreateRepo = vi.mocked(hub.createRepo);
            const mockUploadFile = vi.mocked(hub.uploadFile);

            mockCreateRepo.mockResolvedValue(undefined);
            mockUploadFile.mockResolvedValue(undefined);

            const repoId = 'testuser/test-dataset';

            await huggingFaceService.publishDataset(
                repoId,
                mockFileContent,
                mockCredentials
            );

            // Verify createRepo was called with correct parameters
            expect(mockCreateRepo).toHaveBeenCalledOnce();
            expect(mockCreateRepo).toHaveBeenCalledWith({
                repo: { type: 'dataset', name: repoId },
                credentials: mockCredentials,
                private: true,
            });

            // Verify uploadFile was called with correct parameters
            expect(mockUploadFile).toHaveBeenCalledOnce();
            expect(mockUploadFile).toHaveBeenCalledWith({
                repo: { type: 'dataset', name: repoId },
                credentials: mockCredentials,
                file: {
                    path: 'data.jsonl',
                    content: mockFileContent
                }
            });
        });

        it('should use custom filename when provided', async () => {
            const mockCreateRepo = vi.mocked(hub.createRepo);
            const mockUploadFile = vi.mocked(hub.uploadFile);

            mockCreateRepo.mockResolvedValue(undefined);
            mockUploadFile.mockResolvedValue(undefined);

            const repoId = 'testuser/custom-dataset';
            const customFileName = 'annotations.jsonl';

            await huggingFaceService.publishDataset(
                repoId,
                mockFileContent,
                mockCredentials,
                customFileName
            );

            // Verify uploadFile was called with custom filename
            expect(mockUploadFile).toHaveBeenCalledWith(
                expect.objectContaining({
                    file: expect.objectContaining({
                        path: customFileName
                    })
                })
            );
        });

        it('should pass credentials to both createRepo and uploadFile', async () => {
            const mockCreateRepo = vi.mocked(hub.createRepo);
            const mockUploadFile = vi.mocked(hub.uploadFile);

            const customCredentials: HFCredentials = {
                accessToken: 'custom-token-xyz'
            };

            mockCreateRepo.mockResolvedValue(undefined);
            mockUploadFile.mockResolvedValue(undefined);

            await huggingFaceService.publishDataset(
                'user/dataset',
                mockFileContent,
                customCredentials
            );

            // Verify both calls received the credentials
            expect(mockCreateRepo).toHaveBeenCalledWith(
                expect.objectContaining({
                    credentials: customCredentials
                })
            );

            expect(mockUploadFile).toHaveBeenCalledWith(
                expect.objectContaining({
                    credentials: customCredentials
                })
            );
        });
    });

    describe('Repository Already Exists Handling', () => {
        it('should handle 409 error (repo exists) and continue with upload', async () => {
            const mockCreateRepo = vi.mocked(hub.createRepo);
            const mockUploadFile = vi.mocked(hub.uploadFile);

            // Mock repo creation to throw 409 error
            const error409 = new Error('Repo already exists (409)');
            mockCreateRepo.mockRejectedValue(error409);
            mockUploadFile.mockResolvedValue(undefined);

            const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => { });

            await huggingFaceService.publishDataset(
                'user/existing-repo',
                mockFileContent,
                mockCredentials
            );

            // Verify upload still happened despite repo creation error
            expect(mockUploadFile).toHaveBeenCalledOnce();

            consoleWarnSpy.mockRestore();
        });

        it('should handle error with "exists" message and continue with upload', async () => {
            const mockCreateRepo = vi.mocked(hub.createRepo);
            const mockUploadFile = vi.mocked(hub.uploadFile);

            const errorExists = new Error('Repository exists');
            mockCreateRepo.mockRejectedValue(errorExists);
            mockUploadFile.mockResolvedValue(undefined);

            const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => { });

            await huggingFaceService.publishDataset(
                'user/existing-repo',
                mockFileContent,
                mockCredentials
            );

            // Verify upload proceeded
            expect(mockUploadFile).toHaveBeenCalledOnce();

            consoleWarnSpy.mockRestore();
        });

        it('should log warning but continue when repo creation fails with expected errors', async () => {
            const mockCreateRepo = vi.mocked(hub.createRepo);
            const mockUploadFile = vi.mocked(hub.uploadFile);

            const error = new Error('409 conflict');
            mockCreateRepo.mockRejectedValue(error);
            mockUploadFile.mockResolvedValue(undefined);

            const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => { });

            await expect(
                huggingFaceService.publishDataset(
                    'user/repo',
                    mockFileContent,
                    mockCredentials
                )
            ).resolves.not.toThrow();

            expect(consoleWarnSpy).not.toHaveBeenCalled();

            consoleWarnSpy.mockRestore();
        });
    });

    describe('Error Handling', () => {
        it('should throw error when upload fails', async () => {
            const mockCreateRepo = vi.mocked(hub.createRepo);
            const mockUploadFile = vi.mocked(hub.uploadFile);

            mockCreateRepo.mockResolvedValue(undefined);

            const uploadError = new Error('Upload failed: Network error');
            mockUploadFile.mockRejectedValue(uploadError);

            await expect(
                huggingFaceService.publishDataset(
                    'user/dataset',
                    mockFileContent,
                    mockCredentials
                )
            ).rejects.toThrow('Upload failed: Network error');
        });

        it('should throw error when credentials are invalid', async () => {
            const mockCreateRepo = vi.mocked(hub.createRepo);
            const mockUploadFile = vi.mocked(hub.uploadFile);

            const authError = new Error('Unauthorized: Invalid token');
            mockCreateRepo.mockRejectedValue(authError);
            mockUploadFile.mockResolvedValue(undefined);

            const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => { });

            // Should still attempt upload even if repo creation fails
            await huggingFaceService.publishDataset(
                'user/dataset',
                mockFileContent,
                mockCredentials
            );

            expect(consoleWarnSpy).toHaveBeenCalled();

            consoleWarnSpy.mockRestore();
        });

        it('should handle repo creation errors that are not 409/exists', async () => {
            const mockCreateRepo = vi.mocked(hub.createRepo);
            const mockUploadFile = vi.mocked(hub.uploadFile);

            const unexpectedError = new Error('Unexpected error');
            mockCreateRepo.mockRejectedValue(unexpectedError);
            mockUploadFile.mockResolvedValue(undefined);

            const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => { });

            await huggingFaceService.publishDataset(
                'user/dataset',
                mockFileContent,
                mockCredentials
            );

            // Should log warning for unexpected errors
            expect(consoleWarnSpy).toHaveBeenCalledWith(
                'Repo creation warning (might exist):',
                unexpectedError
            );

            // Should still attempt upload
            expect(mockUploadFile).toHaveBeenCalledOnce();

            consoleWarnSpy.mockRestore();
        });
    });

    describe('File and Blob Handling', () => {
        it('should correctly convert Blob to File object', async () => {
            const mockCreateRepo = vi.mocked(hub.createRepo);
            const mockUploadFile = vi.mocked(hub.uploadFile);

            mockCreateRepo.mockResolvedValue(undefined);
            mockUploadFile.mockResolvedValue(undefined);

            const blobContent = new Blob(['test content'], { type: 'text/plain' });

            await huggingFaceService.publishDataset(
                'user/dataset',
                blobContent,
                mockCredentials,
                'test.txt'
            );

            // Verify the file parameter in uploadFile
            expect(mockUploadFile).toHaveBeenCalledWith(
                expect.objectContaining({
                    file: expect.objectContaining({
                        path: 'test.txt',
                        content: blobContent
                    })
                })
            );
        });

        it('should preserve blob content type', async () => {
            const mockCreateRepo = vi.mocked(hub.createRepo);
            const mockUploadFile = vi.mocked(hub.uploadFile);

            mockCreateRepo.mockResolvedValue(undefined);
            mockUploadFile.mockResolvedValue(undefined);

            const jsonBlob = new Blob(
                [JSON.stringify({ data: 'test' })],
                { type: 'application/json' }
            );

            await huggingFaceService.publishDataset(
                'user/dataset',
                jsonBlob,
                mockCredentials
            );

            const uploadCall = mockUploadFile.mock.calls[0][0];
            expect(uploadCall.file.content).toBe(jsonBlob);
            expect(jsonBlob.type).toBe('application/json');
        });

        it('should handle large file content', async () => {
            const mockCreateRepo = vi.mocked(hub.createRepo);
            const mockUploadFile = vi.mocked(hub.uploadFile);

            mockCreateRepo.mockResolvedValue(undefined);
            mockUploadFile.mockResolvedValue(undefined);

            // Create a large blob (simulating a large dataset)
            const largeData = Array(10000).fill(null).map((_, i) => ({
                id: i,
                text: `Sample text ${i}`,
                label: `label_${i % 10}`
            }));
            const largeBlob = new Blob(
                [JSON.stringify(largeData)],
                { type: 'application/json' }
            );

            await huggingFaceService.publishDataset(
                'user/large-dataset',
                largeBlob,
                mockCredentials,
                'large_data.jsonl'
            );

            expect(mockUploadFile).toHaveBeenCalledOnce();
            const uploadCall = mockUploadFile.mock.calls[0][0];
            expect(uploadCall.file.content.size).toBeGreaterThan(100000); // Should be large
        });
    });

    describe('Console Logging', () => {
        it('should log repo creation step', async () => {
            const mockCreateRepo = vi.mocked(hub.createRepo);
            const mockUploadFile = vi.mocked(hub.uploadFile);

            mockCreateRepo.mockResolvedValue(undefined);
            mockUploadFile.mockResolvedValue(undefined);

            const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => { });

            const repoId = 'user/test-repo';
            await huggingFaceService.publishDataset(
                repoId,
                mockFileContent,
                mockCredentials
            );

            expect(consoleLogSpy).toHaveBeenCalledWith(`Creating/Checking repo: ${repoId}`);
            expect(consoleLogSpy).toHaveBeenCalledWith(`Uploading file to: ${repoId}`);

            consoleLogSpy.mockRestore();
        });
    });

    describe('Repository Configuration', () => {
        it('should create private repository by default', async () => {
            const mockCreateRepo = vi.mocked(hub.createRepo);
            const mockUploadFile = vi.mocked(hub.uploadFile);

            mockCreateRepo.mockResolvedValue(undefined);
            mockUploadFile.mockResolvedValue(undefined);

            await huggingFaceService.publishDataset(
                'user/dataset',
                mockFileContent,
                mockCredentials
            );

            expect(mockCreateRepo).toHaveBeenCalledWith(
                expect.objectContaining({
                    private: true
                })
            );
        });

        it('should specify dataset type for repository', async () => {
            const mockCreateRepo = vi.mocked(hub.createRepo);
            const mockUploadFile = vi.mocked(hub.uploadFile);

            mockCreateRepo.mockResolvedValue(undefined);
            mockUploadFile.mockResolvedValue(undefined);

            await huggingFaceService.publishDataset(
                'user/dataset',
                mockFileContent,
                mockCredentials
            );

            expect(mockCreateRepo).toHaveBeenCalledWith(
                expect.objectContaining({
                    repo: expect.objectContaining({
                        type: 'dataset'
                    })
                })
            );

            expect(mockUploadFile).toHaveBeenCalledWith(
                expect.objectContaining({
                    repo: expect.objectContaining({
                        type: 'dataset'
                    })
                })
            );
        });
    });
});
