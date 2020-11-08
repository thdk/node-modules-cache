import { isPackageChanged } from 'package-changed';
import { Storage, StorageOptions } from '@google-cloud/storage';

import path from 'path';

import { installNodeModules } from './install-node-modules';
import { createArchive, extractArchive } from './archive-node-modules';
import { uploadArchive } from './upload-archive';
import { downloadArchive } from './download-archive';
import { deleteArchive } from './delete-archive';

const NODE_MODULES_TIMER = 'node_modules available after';

export const installPackage = async ({
    bucketName,
    cwd,
    noCache = false,
    storageOptions,
    installCmd,
}: {
    bucketName: string;
    cwd: string;
    noCache?: boolean;
    installCmd?: string;
    storageOptions: Omit<StorageOptions, 'keyFile'>; // keyFile seems to be replaced with keyFileName
}): Promise<void> => {
    console.time(NODE_MODULES_TIMER);

    const gcsClient = new Storage(storageOptions);
    const bucket = gcsClient.bucket(bucketName);

    // get hash for dependencies and devDependencies in package.json
    const { hash, isChanged } = isPackageChanged({
        cwd,
    });

    if (!isChanged) {
        return;
    }

    const cacheExists = !noCache && bucket.file(`${hash}.tgz`).exists();
    const archivePath = path.resolve(cwd, `${hash}.tgz`);

    if (cacheExists) {
        console.info('Archive found in cache bucket.');

        const archive = await downloadArchive({
            file: `${hash}.tgz`,
            archivePath,
            cwd,
            bucket,
        });

        await extractArchive({
            buffer: archive,
            cwd,
            archivePath,
        });

        console.timeEnd(NODE_MODULES_TIMER);
    } else {
        console.info('Nothing found in cache bucket.');

        installNodeModules({
            cwd,
            cmd: installCmd,
        });

        console.timeEnd(NODE_MODULES_TIMER);

        // create node_modules archive on disk
        createArchive({
            archivePath,
            cwd,
        });

        // upload node_modules archive from disk to cache bucket
        uploadArchive({
            archivePath,
            bucket,
        });
    }

    // always cleanup archive (either created or downloaded)
    deleteArchive({
        archivePath,
    });
};
