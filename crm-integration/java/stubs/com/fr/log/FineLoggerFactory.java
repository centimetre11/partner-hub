package com.fr.log;

/** 编译用 stub，运行时由帆软 WEB-INF/lib 提供真实类 */
public final class FineLoggerFactory {
    private FineLoggerFactory() {}

    public static FineLogger getLogger() {
        return new FineLogger();
    }
}
