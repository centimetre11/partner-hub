/** AI 识图/vision 请求统一的图片规格（客户端压缩 + 服务端校验共用） */

export const AI_IMAGE_MAX_SIDE = 1280;
export const AI_IMAGE_JPEG_QUALITY = 0.82;
/** data URL 体积上限（约 1.8MB），超出服务端会拒绝，避免 fetch failed */
export const AI_IMAGE_MAX_DATA_URL_BYTES = 1_800_000;
/** 原图已足够小则跳过 canvas 压缩 */
export const AI_IMAGE_SKIP_COMPRESS_FILE_BYTES = 300_000;
