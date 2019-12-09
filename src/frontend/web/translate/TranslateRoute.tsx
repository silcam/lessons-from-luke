import React from "react";
import { Switch, Route } from "react-router-dom";
import TranslateIndex from "../../common/translate/TranslateIndex";

export default function TranslateRoute() {
  // Move code reading logic here, I think...

  return (
    <Switch>
      <Route
        path="/translate/:code"
        render={({ match }) => <TranslateIndex code={match.params.code} />}
      />
      <Route render={() => <h1>Translate!</h1>} />
    </Switch>
  );
}
