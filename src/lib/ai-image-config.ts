/** AI 识图/vision 请求统一的图片规格（客户端压缩 + 服务端校验共用） */

export const AI_IMAGE_MAX_SIDE = 1024;
export const AI_IMAGE_JPEG_QUALITY = 0.78;
/** data URL 体积上限，超出服务端会拒绝；客户端会尽量压到此以下 */
export const AI_IMAGE_MAX_DATA_URL_BYTES = 1_200_000;
/** 低于此体积且边长已够小才跳过二次压缩 */
export const AI_IMAGE_SKIP_COMPRESS_FILE_BYTES = 120_000;
