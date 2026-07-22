# Contract: Language detail-view route

## Route

`/languages/:languageId` — admin-only client route in
`src/frontend/web/MainRouter.tsx`, gated the same way as the existing
`/admin/invitations*` routes (`{user?.admin && <Route ... />}`), and placed
BEFORE the existing `/languages/:languageId/lessons/:lessonId/docStrings` route so
the more specific docStrings path still matches first (React Router v6 ranks
routes, but list the detail route so it does not shadow docStrings).

Route shape matches the existing flat `/lessons/:id` pattern (spec Clarification;
brainstorm R8).

## Element

Renders `AdminHome` (unchanged page chrome + `LessonsBox`), so a direct hit lands
on the full admin home with the Languages box showing the selected language's
detail (FR-011). Selection is driven by the route param, not local state.

### Wrapper (MainRouter.tsx)

```tsx
// admin-only
{
  user?.admin && <Route path="/languages/:languageId" element={<AdminHome />} />;
}
```

## `LanguagesBox` behavior change

`LanguagesBox` reads `useParams<{ languageId?: string }>()` and
`useNavigate()`:

| Condition                                                    | Render / action                                                      |
| ------------------------------------------------------------ | -------------------------------------------------------------------- |
| No `languageId` param                                        | List view (unchanged); box may be folded.                            |
| `languageId` present, still loading (`useLoad` loading flag) | `<LoadingSnake />` — do NOT redirect yet (research D6).              |
| `languageId` present, loaded, matches an active language     | Auto-unfold; render `<LanguageView language={match} />`.             |
| `languageId` present, loaded, NOT found (archived/bogus)     | `navigate("/")` (or `/languages`) — Languages list (FR-013).         |
| Click a language in the list                                 | `navigate("/languages/" + lang.languageId)` (FR-010).                |
| `LanguageView` "< Languages" back button                     | `navigate` to the list route instead of `setSelectedLanguage(null)`. |

Because `adminLanguages` comes from `languages()` which excludes archived rows,
an archived `languageId` is simply "not found" → redirect (FR-013), with no
separate archived-detection branch required.

## Acceptance mapping

- FR-010 / US3 scenario 1: click updates URL → `navigate`.
- FR-011 / US3 scenarios 2 & 4: refresh / shared link → route renders `AdminHome`,
  `LanguagesBox` reselects from param after load.
- FR-012 / US3 scenario 3: back/forward — native history works because navigation
  uses the router.
- FR-013 / Edge case: archived URL → not-found-after-load → redirect to list.
- FR-014: route is admin-gated; non-admins fall through to the `*` home route.
  </content>
