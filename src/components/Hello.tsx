/**
 * Trivial Preact component proving the integration and JSX config compile.
 * Not used on any page (the placeholder ships zero JS). Phase 4 deletes it
 * when the real Calculator island lands.
 */
export interface HelloProps {
  name: string;
}

export default function Hello({ name }: HelloProps) {
  return <p>Hello, {name}.</p>;
}
