"use client";

import * as React from "react";
import { Check, ChevronsUpDown, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface Celebrity {
  name: string;
  count: number;
}

interface CelebrityComboboxProps {
  celebrities: Celebrity[];
  value: string;
  onValueChange: (value: string) => void;
}

export function CelebrityCombobox({
  celebrities,
  value,
  onValueChange,
}: CelebrityComboboxProps) {
  const [open, setOpen] = React.useState(false);

  const selectedCelebrity = celebrities.find((c) => c.name === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-[220px] sm:w-[260px] justify-between bg-gradient-to-r from-secondary/90 to-secondary/80 border border-border/50 text-foreground hover:from-secondary hover:to-secondary/90 hover:border-border hover:shadow-md rounded-xl h-auto py-2.5 px-4 transition-all duration-200 hover:scale-[1.02] focus:outline-none focus:ring-2 focus:ring-primary/50"
        >
          <div className="flex items-center gap-2 min-w-0">
            <User className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            {value === "All" ? (
              <span className="text-sm font-medium">All People</span>
            ) : selectedCelebrity ? (
              <span className="truncate text-sm font-medium">
                {selectedCelebrity.name}
                <span className="text-muted-foreground ml-1">({selectedCelebrity.count})</span>
              </span>
            ) : (
              <span className="text-sm text-muted-foreground">Select person...</span>
            )}
          </div>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-0 bg-gradient-to-br from-card via-card/95 to-card border border-border/50 rounded-2xl shadow-2xl shadow-black/20 animate-in fade-in slide-in-from-top-2 duration-200" align="start">
        <Command className="bg-transparent">
          <CommandInput
            placeholder="Search people..."
            className="text-foreground placeholder:text-muted-foreground border-b border-border/50 focus:border-primary/50 transition-colors"
          />
          <CommandList className="max-h-[300px]">
            <CommandEmpty className="text-muted-foreground py-8 text-center text-sm">
              <div className="flex flex-col items-center gap-2">
                <svg className="w-8 h-8 text-muted-foreground/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <p>No person found.</p>
              </div>
            </CommandEmpty>
            <CommandGroup className="p-2">
              <CommandItem
                value="All"
                onSelect={() => {
                  onValueChange("All");
                  setOpen(false);
                }}
                className="text-foreground hover:bg-gradient-to-r hover:from-accent hover:to-accent/80 data-[selected=true]:bg-gradient-to-r data-[selected=true]:from-accent data-[selected=true]:to-accent/80 rounded-xl px-3 py-2.5 cursor-pointer transition-all duration-200 hover:scale-[1.02]"
              >
                <Check
                  className={cn(
                    "mr-2.5 h-4 w-4 text-primary",
                    value === "All" ? "opacity-100" : "opacity-0"
                  )}
                />
                <span className="font-medium">All People</span>
              </CommandItem>
              {celebrities.map((celebrity) => (
                <CommandItem
                  key={celebrity.name}
                  value={celebrity.name}
                  onSelect={() => {
                    onValueChange(celebrity.name);
                    setOpen(false);
                  }}
                  className="text-foreground hover:bg-gradient-to-r hover:from-accent hover:to-accent/80 data-[selected=true]:bg-gradient-to-r data-[selected=true]:from-accent data-[selected=true]:to-accent/80 rounded-xl px-3 py-2.5 cursor-pointer transition-all duration-200 hover:scale-[1.02] group/item"
                >
                  <Check
                    className={cn(
                      "mr-2.5 h-4 w-4 text-primary transition-all duration-200",
                      value === celebrity.name ? "opacity-100 scale-100" : "opacity-0 scale-95"
                    )}
                  />
                  <span className="truncate flex-1 font-medium">{celebrity.name}</span>
                  <span className="text-muted-foreground text-xs ml-2 bg-gradient-to-r from-secondary/80 to-secondary/60 px-2.5 py-1 rounded-lg font-semibold border border-border/30 group-hover/item:border-primary/30 transition-colors">
                    {celebrity.count}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
