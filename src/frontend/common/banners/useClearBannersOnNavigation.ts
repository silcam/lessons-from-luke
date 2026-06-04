import { useEffect } from "react";
import { useDispatch } from "react-redux";
import { useLocation } from "react-router-dom";
import bannerSlice from "./bannerSlice";

// Banner errors are contextual to the page/action that caused them.
// Issue #64: a 504 banner could otherwise persist when the user navigated
// elsewhere via React Router.
export function useClearBannersOnNavigation() {
  const dispatch = useDispatch();
  const location = useLocation();
  useEffect(() => {
    dispatch(bannerSlice.actions.reset());
  }, [location.pathname]);
}
