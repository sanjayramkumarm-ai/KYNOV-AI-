import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';
import { Logo } from '../components/common/Logo';

export default function NotFoundPage() {
  return (
    <div className="grid min-h-screen place-items-center px-4">
      <div className="panel w-full max-w-md p-8 text-center">
        <div className="mb-6 flex justify-center">
          <Logo to="/" />
        </div>
        <Compass className="mx-auto h-10 w-10 text-cyan-300" aria-hidden />
        <h1 className="mt-4 font-display text-2xl font-semibold">This page drifted out of orbit</h1>
        <p className="mt-2 text-sm text-muted">The route you followed does not exist in your workspace.</p>
        <div className="mt-6 flex justify-center gap-2">
          <Link to="/dashboard" className="btn-primary">Back to dashboard</Link>
          <Link to="/search" className="btn-secondary">Smart search</Link>
        </div>
      </div>
    </div>
  );
}
