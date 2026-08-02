"use client";

import type { ComponentProps } from "react";

type ConfirmCollectionButtonProps = {
  formAction: ComponentProps<"button">["formAction"];
  name: string;
  value: string;
};

export function ConfirmCollectionButton({
  formAction,
  name,
  value,
}: ConfirmCollectionButtonProps) {
  return (
    <button
      className="btn-primary small-btn"
      type="submit"
      formAction={formAction}
      name={name}
      value={value}
      onClick={(event) => {
        if (
          !window.confirm(
            "Xác nhận đã thu tiền? Hành động này sẽ tạo payment thật và không tự hoàn tác từ màn hình này."
          )
        ) {
          event.preventDefault();
        }
      }}
    >
      Xác nhận đã thu
    </button>
  );
}
