// Ark UI tabs (integration task). Adapted for this codebase:
//  - no "use client" directive (Vite SPA, not Next.js RSC);
//  - `data-selected:` variants rewritten to Tailwind 3's arbitrary
//    data-attribute form `data-[selected]:` (the bare named variant is
//    Tailwind v4 syntax and compiles to nothing on Tailwind 3.4).
// Exports the shared pill-tab class strings so app pages (e.g. AdminPanel)
// can reuse the exact same look on their own Ark Tabs.
import { Tabs } from '@ark-ui/react/tabs';

export const tabListClass =
  'flex gap-1 p-1 bg-gray-100 rounded-lg dark:bg-gray-700 w-fit';

export const tabTriggerClass =
  'px-4 py-2 text-sm font-medium text-gray-600 rounded-md transition-all ' +
  'data-[selected]:bg-white data-[selected]:text-gray-900 data-[selected]:shadow-sm ' +
  'dark:text-gray-300 dark:data-[selected]:bg-gray-800 dark:data-[selected]:text-gray-100';

const tabs = [
  {
    value: 'tab1',
    label: 'Dashboard',
    content: 'Main dashboard with key metrics and insights.',
  },
  {
    value: 'tab2',
    label: 'Analytics',
    content: 'Track performance with detailed reports.',
  },
  {
    value: 'tab3',
    label: 'Settings',
    content: 'Configure preferences and account options.',
  },
];

export default function TabsBasic() {
  return (
    <div className="bg-white dark:bg-gray-800 w-full px-4 py-12 rounded-xl flex flex-col items-center">
      <Tabs.Root defaultValue="tab1" className="w-full flex flex-col items-center">
        <Tabs.List className={`${tabListClass} mb-8`}>
          {tabs.map(tab => (
            <Tabs.Trigger key={tab.value} value={tab.value} className={tabTriggerClass}>
              {tab.label}
            </Tabs.Trigger>
          ))}
        </Tabs.List>

        {tabs.map(tab => (
          <Tabs.Content key={tab.value} value={tab.value}
            className="text-center text-gray-600 dark:text-gray-300">
            {tab.content}
          </Tabs.Content>
        ))}
      </Tabs.Root>
    </div>
  );
}
