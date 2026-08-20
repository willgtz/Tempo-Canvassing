// template.tsx (unlike layout.tsx) remounts fresh on every navigation —
// that's what makes the fade-in fire every time a page's content actually
// arrives, replacing a loading.tsx skeleton with a smooth reveal instead
// of an abrupt pop. Nav bars/layouts live above this in the tree, so they
// stay stable and never re-fade themselves.
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="page-fade-in flex flex-1 flex-col">{children}</div>;
}
