import { z } from 'zod';

declare const s3FilesToolInputSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
    command: z.ZodLiteral<"list">;
    path: z.ZodDefault<z.ZodString>;
    depth: z.ZodOptional<z.ZodNumber>;
    limit: z.ZodOptional<z.ZodNumber>;
}, z.core.$strip>, z.ZodObject<{
    command: z.ZodLiteral<"view">;
    path: z.ZodString;
    startLine: z.ZodOptional<z.ZodNumber>;
    endLine: z.ZodOptional<z.ZodNumber>;
}, z.core.$strip>, z.ZodObject<{
    command: z.ZodLiteral<"write">;
    path: z.ZodString;
    content: z.ZodString;
    append: z.ZodOptional<z.ZodBoolean>;
    createParents: z.ZodOptional<z.ZodBoolean>;
}, z.core.$strip>, z.ZodObject<{
    command: z.ZodLiteral<"mkdir">;
    path: z.ZodString;
    recursive: z.ZodOptional<z.ZodBoolean>;
}, z.core.$strip>, z.ZodObject<{
    command: z.ZodLiteral<"delete">;
    path: z.ZodString;
    recursive: z.ZodOptional<z.ZodBoolean>;
}, z.core.$strip>, z.ZodObject<{
    command: z.ZodLiteral<"stat">;
    path: z.ZodString;
}, z.core.$strip>, z.ZodObject<{
    command: z.ZodLiteral<"str_replace">;
    path: z.ZodString;
    oldStr: z.ZodString;
    newStr: z.ZodString;
    replaceAll: z.ZodOptional<z.ZodBoolean>;
}, z.core.$strip>], "command">;
declare const s3FilesToolOutputSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
    ok: z.ZodLiteral<true>;
    command: z.ZodLiteral<"list">;
    path: z.ZodString;
    entries: z.ZodArray<z.ZodObject<{
        path: z.ZodString;
        name: z.ZodString;
        type: z.ZodEnum<{
            file: "file";
            directory: "directory";
        }>;
        size: z.ZodNumber;
        mtime: z.ZodNullable<z.ZodString>;
        mode: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strip>>;
    truncated: z.ZodBoolean;
    limit: z.ZodNumber;
}, z.core.$strip>, z.ZodObject<{
    ok: z.ZodLiteral<true>;
    command: z.ZodLiteral<"view">;
    path: z.ZodString;
    content: z.ZodString;
    startLine: z.ZodNumber;
    endLine: z.ZodNumber;
    totalLines: z.ZodNumber;
    size: z.ZodNumber;
    truncated: z.ZodBoolean;
    truncatedByBytes: z.ZodBoolean;
    truncatedByLines: z.ZodBoolean;
}, z.core.$strip>, z.ZodObject<{
    ok: z.ZodLiteral<true>;
    command: z.ZodLiteral<"write">;
    path: z.ZodString;
    bytesWritten: z.ZodNumber;
    appended: z.ZodBoolean;
}, z.core.$strip>, z.ZodObject<{
    ok: z.ZodLiteral<true>;
    command: z.ZodLiteral<"mkdir">;
    path: z.ZodString;
    created: z.ZodLiteral<true>;
}, z.core.$strip>, z.ZodObject<{
    ok: z.ZodLiteral<true>;
    command: z.ZodLiteral<"delete">;
    path: z.ZodString;
    deleted: z.ZodLiteral<true>;
}, z.core.$strip>, z.ZodObject<{
    ok: z.ZodLiteral<true>;
    command: z.ZodLiteral<"stat">;
    path: z.ZodString;
    entry: z.ZodObject<{
        path: z.ZodString;
        type: z.ZodEnum<{
            file: "file";
            directory: "directory";
        }>;
        size: z.ZodNumber;
        mtime: z.ZodNullable<z.ZodString>;
        mode: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strip>;
}, z.core.$strip>, z.ZodObject<{
    ok: z.ZodLiteral<true>;
    command: z.ZodLiteral<"str_replace">;
    path: z.ZodString;
    replacements: z.ZodNumber;
    bytesWritten: z.ZodNumber;
}, z.core.$strip>], "command">;
type S3FilesToolInput = z.infer<typeof s3FilesToolInputSchema>;
type S3FilesToolOutput = z.infer<typeof s3FilesToolOutputSchema>;

export type { S3FilesToolInput as S, S3FilesToolOutput as a };
