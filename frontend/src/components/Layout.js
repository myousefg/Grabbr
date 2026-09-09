import Sidebar from './Sidebar';

export default function Layout({ children }) {
  return (
    <div className="flex h-screen overflow-hidden bg-background" data-testid="app-layout">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="p-8 lg:p-10 max-w-5xl">
          {children}
        </div>
      </main>
    </div>
  );
}
