import { EncodedTypeMapping } from "./TrajectoryFileInfo";

// An individual entry parsed from an encoded name
interface DecodedTypeEntry {
    id: number;
    name: string;
    tags: string[];
}

export interface SelectionStateInfo {
    highlightedNames: string[];
    highlightedTags: string[];
    hiddenNames: string[];
    hiddenTags: string[];
}

interface DisplayStateEntry {
    name: string;
    id: string;
}

interface UIDisplayEntry {
    name: string;
    displayStates: DisplayStateEntry[];
}

export type UIDisplayData = UIDisplayEntry[];

class SelectionInterface {
    private entries: Map<string, DecodedTypeEntry>;

    public constructor() {
        this.entries = new Map<string, DecodedTypeEntry>();
    }

    public containsName(name: string): boolean {
        return this.entries.hasOwnProperty(name);
    }

    public containsTag(tag: string): boolean {
        return Object.values(this.entries).some((entriesArr) => {
            return entriesArr.some((entry) => {
                return entry.tags.includes(tag);
            });
        });
    }

    public parse(idNameMapping: EncodedTypeMapping): void {
        this.clear();

        Object.keys(idNameMapping).forEach((id) => {
            this.decode(idNameMapping[id], parseInt(id));
        });
    }

    public decode(encodedName: string, idParam?: number): void {
        let name = "";
        let tags: string[] = [];
        const id = idParam !== undefined ? idParam : -1;

        if (encodedName.includes("#")) {
            const s = encodedName.split("#");
            tags = s[1].split("_");
            name = s[0];
        } else {
            name = encodedName;
        }

        if (!name) {
            throw Error("invalid name: " + encodedName);
        }

        const uniqueTags = [...new Set(tags)];
        const entry = { id: id, name: name, tags: uniqueTags };

        if (!Object.keys(this.entries).includes(name)) {
            this.entries[name] = [];
        }

        this.entries[name].push(entry);
    }

    public getIds(name: string, tags?: string[]): number[] {
        const entryList = this.entries[name];
        const indices: number[] = [];

        entryList.forEach((entry) => {
            if (!tags || tags.every((t) => entry.tags.includes(t))) {
                if (entry.id >= 0) {
                    indices.push(entry.id);
                }
            }
        });

        return indices;
    }

    public getIdsByTags(tags: string[]): number[] {
        let indices: number[] = [];
        Object.keys(this.entries).forEach((name) => {
            indices = indices.concat(this.getIds(name, tags));
        });

        indices.sort();
        return indices;
    }

    /*
     * If an entity has both a name and all the tags specified in the
     * selection state info, it will be considered hilighted
     */
    public getHighlightedIds(info: SelectionStateInfo): number[] {
        let names =
            info.highlightedNames.filter((element) => {
                return element != undefined && element != "";
            }) || [];
        const tags: string[] =
            info.highlightedTags.filter((element) => {
                return element != undefined && element != "";
            }) || [];
        let indices: number[] = [];

        // If no name is specified, search all entries for matching tags
        if (names.length === 0) {
            names = Object.keys(this.entries);
        }

        // If there are tags but no name,
        //  search all names for matching tags

        Object.keys(this.entries).forEach((name) => {
            if (!names || names.length === 0 || names.includes(name)) {
                // If no tags are specified, this will return all register a
                //  match for all entries
                indices = indices.concat(this.getIds(name, tags));
            }
        });

        return indices;
    }

    /*
     * If an entry has a name specified in the selection state info
     * or a tag specified, it will be considered hidden
     */
    public getHiddenIds(info: SelectionStateInfo): number[] {
        const hiddenNames =
            info.hiddenNames.filter((element) => {
                return element != undefined && element != "";
            }) || [];
        const hiddenTags =
            info.hiddenTags.filter((element) => {
                return element != undefined && element != "";
            }) || [];
        const hiddenIndices: number[] = [];

        Object.keys(this.entries).forEach((name) => {
            // If the name is on the hidden list...
            if (
                hiddenNames &&
                hiddenNames.length === 0 &&
                hiddenNames.includes(name)
            ) {
                const entryList = this.entries[name];

                entryList.forEach((entry) => {
                    // And tags on the hidden list are found...
                    if (hiddenTags.every((t) => entry.tags.includes(t))) {
                        if (entry.id > 0) {
                            // This entry is hidden
                            hiddenIndices.push(entry.id);
                        }
                    }
                });
            }
        });

        return hiddenIndices;
    }

    public clear(): void {
        this.entries = new Map<string, DecodedTypeEntry>();
    }

    public getUIDisplayData(): UIDisplayData {
        return Object.keys(this.entries).map((name) => {
            const displayStates: DisplayStateEntry[] = [];
            const encounteredTags: string[] = [];

            this.entries[name].forEach((entry) => {
                entry.tags.forEach((tag) => {
                    if (encounteredTags.includes(tag)) {
                        return;
                    }
                    encounteredTags.push(tag);

                    const displayState: DisplayStateEntry = {
                        name: tag,
                        id: tag,
                    };
                    displayStates.push(displayState);
                });
            });

            return {
                name,
                displayStates,
            };
        });
    }
}

export { SelectionInterface };
export default SelectionInterface;
