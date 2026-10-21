// Android keeps a text selection (the handles and the copy bar) until the selected text itself is touched again: a tap anywhere else leaves
// it. This makes MainActivity take the focus away from the selected text when a touch starts outside it, which ends the selection.
const { withMainActivity } = require("@expo/config-plugins");

const MARK = "ohmatrix: dismiss text selection";
const METHOD = `
  // ${MARK}
  override fun dispatchTouchEvent(ev: android.view.MotionEvent): Boolean {
    if (ev.actionMasked == android.view.MotionEvent.ACTION_DOWN) {
      val focused = currentFocus
      if (focused is android.widget.TextView && focused !is android.widget.EditText && focused.hasSelection()) {
        val box = android.graphics.Rect()
        focused.getGlobalVisibleRect(box)
        if (!box.contains(ev.rawX.toInt(), ev.rawY.toInt())) focused.clearFocus()
      }
    }
    return super.dispatchTouchEvent(ev)
  }
`;

module.exports = (config) =>
  withMainActivity(config, (c) => {
    const m = c.modResults;
    if (m.language !== "kt") throw new Error("withDismissSelection: MainActivity is not Kotlin");
    if (!m.contents.includes(MARK)) {
      const end = m.contents.lastIndexOf("}");
      if (end < 0) throw new Error("withDismissSelection: no class body in MainActivity");
      m.contents = m.contents.slice(0, end) + METHOD + m.contents.slice(end);
    }
    return c;
  });
