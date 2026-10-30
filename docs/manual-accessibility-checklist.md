# Manual accessibility checklist (no screen reader)

Run this before a release, and after a change to the shell, dialogs, the palette or the Note screen. It needs only a keyboard, a mouse and your browser. The automated tests already check contrast, names, roles and keyboard focus on every screen (`axe-matrix`, `keyboard`); this list covers what they cannot see.

Tick a box when it works. If it does not, write what you saw next to it. About 20 minutes.

**Setup:** start the local stack, sign in as the test account, use Chrome or Edge.

## 1. Keyboard only (put the mouse away)

- [ ] **Tab order.** On Home, press `Tab` from the top of the page. Focus moves left to right, top to bottom: rail, panel, then the page. It never jumps somewhere surprising.
- [ ] **Focus is always visible.** As you `Tab` through Home, All Items and a Note, you can always see which control has focus (a ring or outline).
- [ ] **Palette.** `Ctrl` + `K` opens it with the cursor in the search box. Type a Note title, press the up arrow to the Note, `Enter` opens it. `Esc` closes it and focus returns to where you were.
- [ ] **Row menu.** On All Items, `Tab` to a row's "..." button, `Enter` opens the menu, arrows move, `Esc` closes it and focus is back on "...".
- [ ] **Dialogs.** Open Move to Folder, Rename (on a Tag) and Delete (on a Tag). Each traps `Tab` inside, closes on `Esc`, and focus returns to the button that opened it.
- [ ] **Tags.** On a Note, `Tab` to "+ Tag", press `Enter`, type a name, press `Enter`. The Tag appears and focus is back on "+ Tag".
- [ ] **Forms.** On the sign-in page, type email, `Tab`, password, `Enter`. You sign in. You do not get a reset email.
- [ ] **No traps.** You can always `Tab` out of the Note editor (or press `Esc` then `Tab`), and out of the Link autocomplete.

## 2. Zoom and text size

- [ ] **200% zoom** (`Ctrl` + `+` until 200%). Home, All Items, a Note, Trash, Admin: nothing is cut off, no text overlaps, and you can reach every button.
- [ ] **400% zoom** (phone-like layout). The page scrolls up and down only, never sideways (except a wide table inside its own box).
- [ ] **Large text.** In Windows, set Settings > Accessibility > Text size to 150%. Open the app: text grows and nothing is clipped.

## 3. Colour and contrast

- [ ] **Both themes.** Switch Light and Dark from the account menu. Read Home, a Note, Trash and the Tags page. Nothing is hard to read, and Tag pills, badges and buttons are all legible.
- [ ] **Not colour alone.** Every status says it in words too: Active or Disabled, Pending or Revoked, "N days left", and an unresolved Link is dashed and italic as well as grey.
- [ ] **Windows high contrast.** Turn on a contrast theme (`Alt` + left `Shift` + `Print Screen`). Buttons, inputs and focus rings are still visible. Turn it off again.

## 4. Motion

- [ ] **Reduced motion.** Settings > Accessibility > Visual effects > turn Animation effects off, then reload. Dialogs and menus appear without sliding or fading, and nothing flashes.

## 5. Phone width and touch

- [ ] **375 px wide.** In the browser's device toolbar choose a phone. Open Home, All Items, a Note (Details opens as a sheet), Trash and Admin. Rows stack, there is no sideways scrolling, and the menu button opens the navigation.
- [ ] **Touch targets.** On the phone view, the buttons you tap (row "...", Tag x, dialog buttons) are comfortably large and not squeezed together.

## 6. Messages and errors

- [ ] **Errors are visible and near the problem.** Rename a Tag to a name you already have; sign in with a wrong password; create an Invite with a bad email. Each shows a clear message next to the field or form.
- [ ] **Confirmations.** Move an Item to the Trash, restore something, copy an Invite link. A toast says what happened, then goes away by itself.
- [ ] **Page titles.** Each page's browser tab title makes sense (Home, a Note's title, Trash...).

## 7. Optional: Narrator

Narrator checks what is announced aloud, which nothing above can. It is optional, and worth doing once before a public launch: `docs/narrator-checklist.md`.

## Result

Date: ______  Browser and version: ______  Windows: ______

Failures (section, item, what you saw):

-
