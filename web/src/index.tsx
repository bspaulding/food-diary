/* @refresh reload */
import type { Component } from "solid-js";
import { render } from "solid-js/web";
import { Router, Route } from "@solidjs/router";

import "./index.css";
import App from "./App";
import DiaryList from "./DiaryList";
import NewNutritionItemForm from "./NewNutritionItemForm";
import NutritionItemShow from "./NutritionItemShow";
import NutritionItemEdit from "./NutritionItemEdit";
import NewDiaryEntryForm from "./NewDiaryEntryForm";
import NewRecipeForm from "./NewRecipeForm";
import RecipeShow from "./RecipeShow";
import RecipeEdit from "./RecipeEdit";
import ImportDiaryEntries from "./ImportDiaryEntries";
import ExportDiaryEntries from "./ExportDiaryEntries";
import UserProfile from "./UserProfile";
import DiaryEntryEditForm from "./DiaryEntryEditForm";
import Trends from "./Trends";
import { NutritionTargetsProvider } from "./NutritionTargets";

render(
  () => (
    <NutritionTargetsProvider>
      <Router root={App}>
        <Route path="/auth/callback" />
        <Route path="/auth/logout" />
        <Route path="/" component={DiaryList} />
        <Route path="/trends" component={Trends} />
        <Route path="/profile" component={UserProfile} />
        <Route
          path="/diary_entry/new"
          component={NewDiaryEntryForm as Component}
        />
        <Route path="/diary_entry/:id/edit" component={DiaryEntryEditForm} />
        <Route path="/diary_entry/import" component={ImportDiaryEntries} />
        <Route path="/diary_entry/export" component={ExportDiaryEntries} />
        <Route
          path="/nutrition_item/new"
          component={NewNutritionItemForm as Component}
        />
        <Route path="/nutrition_item/:id" component={NutritionItemShow} />
        <Route path="/nutrition_item/:id/edit" component={NutritionItemEdit} />
        <Route path="/recipe/new" component={NewRecipeForm as Component} />
        <Route path="/recipe/:id" component={RecipeShow} />
        <Route path="/recipe/:id/edit" component={RecipeEdit} />
      </Router>
    </NutritionTargetsProvider>
  ),
  (() => {
    const rootElement = document.getElementById("root");
    if (!rootElement) {
      throw new Error("Root element not found");
    }
    return rootElement;
  })(),
);
