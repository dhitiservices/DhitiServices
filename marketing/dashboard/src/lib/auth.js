import { createContext, useContext } from "react";

/** { user, signOut(scope?: 'local' | 'global'), demo } for the signed-in app. */
export const AuthContext = createContext({ user: null, signOut: async () => {}, demo: false });
export const useAuth = () => useContext(AuthContext);
