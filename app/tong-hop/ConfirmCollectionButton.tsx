"use client";

import { useEffect } from "react";

const CONFIRM_SELECTOR = "[data-confirm-collection]";

export function ConfirmCollectionButton() {
  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element) || !target.closest(CONFIRM_SELECTOR)) {
        return;
      }

      if (
        !window.confirm(
          "Xác nhận đã thu tiền? Hành động này sẽ tạo payment thật và không tự hoàn tác từ màn hình này."
        )
      ) {
        event.preventDefault();
      }
    };

    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, []);

  return null;
}
