Name:           youtubeUnblock
Version:		0.3.1
Release:		1%{?git_rel}%{?dist}
Summary:		Bypasses Googlevideo detection systems that relies on SNI
License:		GPL-3.0
Group:          Productivity

Url:			https://github.com/Waujito/youtubeUnblock
Source:			%{url}/archive/refs/tags/v%{version}.tar.gz
BuildRequires:	gcc-c++
BuildRequires:	autoconf
BuildRequires:	libtool
BuildRequires:	make
BuildRequires:	automake
BuildRequires:	pkg-config
BuildRequires:	systemd-rpm-macros
BuildRequires:	glibc-static

%description

Bypasses Googlevideo detection systems that relies on SNI.



%prep
%autosetup -n %{name}-%{version} -p1
sed -i 's|$(PREFIX)/bin/youtubeUnblock|/usr/bin/youtubeUnblock|' youtubeUnblock.service


%build
%make_build

%install
make install PREFIX=%{buildroot}/usr

%post
%systemd_post youtubeUnblock.service

%preun
%systemd_preun youtubeUnblock.service

%postun
%systemd_postun_with_restart youtubeUnblock.service

%files
%{_bindir}/%{name}
%{_unitdir}/%{name}.service

%changelog
