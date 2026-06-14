"use client";

export function DeletePartnerButton({
  partnerName,
  action,
}: {
  partnerName: string;
  action: () => Promise<void>;
}) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (
          !confirm(
            `确定要永久删除「${partnerName}」吗？此操作不可恢复，相关联系人、商机、时间线等数据将一并删除。`,
          )
        ) {
          e.preventDefault();
        }
      }}
    >
      <button
        type="submit"
        className="rounded-md border border-red-100 px-2.5 py-1 text-xs text-red-500 hover:bg-red-50"
        title="从数据库永久删除"
      >
        删除
      </button>
    </form>
  );
}
